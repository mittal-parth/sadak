"use client";

import { useEffect, useState } from "react";

/** True when we should show touch-first play controls (phone / tablet). */
export function useMobilePlay(): { mobilePlay: boolean; portrait: boolean } {
  const [mobilePlay, setMobilePlay] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const narrow = window.matchMedia("(max-width: 1024px)");

    const sync = () => {
      setMobilePlay(coarse.matches || narrow.matches);
      setPortrait(window.innerHeight > window.innerWidth);
    };

    sync();
    coarse.addEventListener("change", sync);
    narrow.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      coarse.removeEventListener("change", sync);
      narrow.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return { mobilePlay, portrait };
}
