import { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectTheme, setTheme } from '@/store/slices/uiSlice';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'));
  const setDarkMode = () => dispatch(setTheme('dark'));
  const setLightMode = () => dispatch(setTheme('light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setDarkMode, setLightMode, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
