import { useLayoutEffect } from "react";

export function usePageTitle(pageTitle: string): void {
  useLayoutEffect(() => {
    document.title = `${pageTitle} · Agent Coordination`;
  }, [pageTitle]);
}
