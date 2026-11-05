import { useCallback, useContext } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";

/**
 * Like useNavigate, but never re-renders the caller when the location changes.
 * useNavigate reads the current location, so every game card using it
 * re-rendered on each navigation, including cards on hidden pages. Paths are
 * not resolved against the current route, so pass absolute paths only.
 */
export default function useStableNavigate() {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  return useCallback(
    (to, options = {}) => {
      if (typeof to === "number") {
        navigator.go(to);
        return;
      }
      (options.replace ? navigator.replace : navigator.push)(to, options.state, options);
    },
    [navigator]
  );
}
