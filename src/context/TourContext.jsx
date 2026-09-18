import { createContext, useContext, useState } from "react";

const TourContext = createContext();

export function useTour() {
  return useContext(TourContext);
}

export function TourProvider({ children }) {
  const [isTourActive, setTourActive] = useState(false);

  return (
    <TourContext.Provider value={{ isTourActive, setTourActive }}>
      {children}
    </TourContext.Provider>
  );
}
