"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SearchContextValue {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  setOpen: (open: boolean) => void;
}

const SearchContext = createContext<SearchContextValue>({
  open: false,
  openSearch: () => {},
  closeSearch: () => {},
  setOpen: () => {},
});

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  return (
    <SearchContext.Provider value={{ open, openSearch, closeSearch, setOpen }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}
