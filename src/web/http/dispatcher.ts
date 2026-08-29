export const httpMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export type HttpMethod = (typeof httpMethods)[number];

type StripLeadingSlash<Path extends string> = Path extends `/${infer Rest}` ? Rest : Path;
type SegmentParameter<Segment extends string> = Segment extends `:${infer Name}` ? Name : never;
type PathParameters<Path extends string> =
  StripLeadingSlash<Path> extends `${infer Head}/${infer Tail}`
    ? SegmentParameter<Head> | PathParameters<Tail>
    : SegmentParameter<StripLeadingSlash<Path>>;
type RouteParameters<Path extends string> = [PathParameters<Path>] extends [never]
  ? Record<never, never>
  : { [Name in PathParameters<Path>]: string };

export interface RouteCatalogEntry {
  method: HttpMethod;
  template: string;
  owner: string;
}

export type DispatchResult =
  | { kind: "matched" }
  | { kind: "not-found" }
  | { kind: "method-not-allowed"; allowedMethods: HttpMethod[] }
  | { kind: "invalid-path-encoding" };

type RouteHandler<Context, Template extends string> = (
  context: Context & { params: RouteParameters<Template> },
) => void | Promise<void>;

interface RegisteredRoute<Context> extends RouteCatalogEntry {
  segments: RouteSegment[];
  handler: RouteHandler<Context, string>;
}

type RouteSegment =
  | { kind: "literal"; value: string }
  | { kind: "parameter"; name: string };

export interface HttpDispatcher<Context> {
  register<const Template extends string>(
    method: HttpMethod,
    template: Template,
    owner: string,
    handler: RouteHandler<Context, Template>,
  ): void;
  dispatch(method: string, pathname: string, context: Context): Promise<DispatchResult>;
  catalog(): RouteCatalogEntry[];
}

export function createHttpDispatcher<Context>(): HttpDispatcher<Context> {
  const routes: RegisteredRoute<Context>[] = [];

  return {
    register(method, template, owner, handler) {
      const segments = parseTemplate(template);
      const duplicate = routes.find((route) => route.method === method && route.template === template);
      if (duplicate !== undefined) {
        throw new Error(
          `Duplicate ${method} route ${template}: already owned by ${duplicate.owner}; cannot register owner ${owner}`,
        );
      }
      const ambiguous = routes.find((route) =>
        route.method === method && sameStructure(route.segments, segments)
      );
      if (ambiguous !== undefined) {
        throw new Error(
          `Ambiguous ${method} route: ${ambiguous.template} (${ambiguous.owner}) conflicts with ${template} (${owner})`,
        );
      }
      routes.push({
        method,
        template,
        owner,
        segments,
        handler: handler as RouteHandler<Context, string>,
      });
    },

    async dispatch(method, pathname, context) {
      const pathSegments = splitPath(pathname);
      const matchingPaths = routes
        .filter((route) => matchesShape(route.segments, pathSegments))
        .sort(compareSpecificity);
      const route = matchingPaths.find((candidate) => candidate.method === method);
      if (route === undefined) {
        if (matchingPaths.length === 0) return { kind: "not-found" };
        const allowedMethods = httpMethods.filter((candidate) =>
          matchingPaths.some((matchingRoute) => matchingRoute.method === candidate)
        );
        return { kind: "method-not-allowed", allowedMethods };
      }
      const params = decodeParameters(route.segments, pathSegments);
      if (params === undefined) return { kind: "invalid-path-encoding" };
      await route.handler(Object.assign({}, context, { params }));
      return { kind: "matched" };
    },

    catalog() {
      return routes
        .map(({ method, template, owner }) => ({ method, template, owner }))
        .sort((left, right) =>
          compareText(left.method, right.method) ||
          compareText(left.template, right.template) ||
          compareText(left.owner, right.owner)
        );
    },
  };
}

function parseTemplate(template: string): RouteSegment[] {
  if (!template.startsWith("/") || template.includes("?") || template.includes("#")) {
    throw new Error(`Route template must be an absolute pathname: ${template}`);
  }
  const parameterNames = new Set<string>();
  return splitPath(template).map((segment) => {
    if (!segment.startsWith(":")) return { kind: "literal", value: segment };
    const name = segment.slice(1);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid named segment :${name} in route template ${template}`);
    }
    if (parameterNames.has(name)) {
      throw new Error(`Duplicate named segment :${name} in route template ${template}`);
    }
    parameterNames.add(name);
    return { kind: "parameter", name };
  });
}

function splitPath(path: string): string[] {
  return path === "/" ? [] : path.slice(1).split("/");
}

function matchesShape(route: RouteSegment[], path: string[]): boolean {
  return route.length === path.length && route.every((segment, index) =>
    segment.kind === "parameter"
      ? path[index] !== ""
      : segment.value === path[index]
  );
}

function sameStructure(left: RouteSegment[], right: RouteSegment[]): boolean {
  return left.length === right.length && left.every((segment, index) => {
    const other = right[index];
    return other !== undefined && (
      segment.kind === "parameter"
        ? other.kind === "parameter"
        : other.kind === "literal" && other.value === segment.value
    );
  });
}

function compareSpecificity<Context>(left: RegisteredRoute<Context>, right: RegisteredRoute<Context>): number {
  for (let index = 0; index < left.segments.length; index += 1) {
    const leftSegment = left.segments[index];
    const rightSegment = right.segments[index];
    if (leftSegment?.kind !== rightSegment?.kind) return leftSegment?.kind === "literal" ? -1 : 1;
  }
  return compareText(left.template, right.template);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decodeParameters(route: RouteSegment[], path: string[]): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  try {
    route.forEach((segment, index) => {
      if (segment.kind === "parameter") params[segment.name] = decodeURIComponent(path[index] ?? "");
    });
    return params;
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}
