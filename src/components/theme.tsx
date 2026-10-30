"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "cv:theme:v2"; // v2: default changed to light, so older saved choices are ignored

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

/** Light/dark theme (D9). The initial class is set by an inline script in the layout. */
export function useTheme() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  }, []);
  return { dark, toggle };
}

/** Light by default; dark only when the user has picked it with the theme toggle. */
export const themeInitScript = `(function(){try{if(localStorage.getItem('${KEY}')==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;
