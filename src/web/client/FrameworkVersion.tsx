export function FrameworkVersion() {
  return <span className="framework-version">(v{import.meta.env.VITE_FRAMEWORK_VERSION})</span>;
}
