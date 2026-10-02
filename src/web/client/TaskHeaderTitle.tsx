import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

export function TaskHeaderTitle({ title, headingRef }: {
  title: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}): ReactNode {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const heading = headingRef.current;
    const header = titleRef.current?.closest("header");
    if (heading === null || header === undefined || header === null) return;
    const measure = (): void => {
      setVisible(heading.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom);
    };
    let intersection: IntersectionObserver | undefined;
    const observe = (): void => {
      intersection?.disconnect();
      intersection = new IntersectionObserver(measure, {
        rootMargin: `-${header.getBoundingClientRect().bottom}px 0px 0px 0px`,
      });
      intersection.observe(heading);
      measure();
    };
    const resize = new ResizeObserver(observe);
    resize.observe(header);
    resize.observe(heading);
    observe();
    return () => {
      intersection?.disconnect();
      resize.disconnect();
    };
  }, [headingRef]);

  return <span ref={titleRef} className="task-header-title" aria-hidden={!visible}
    title={visible ? title : undefined}>{title}</span>;
}
