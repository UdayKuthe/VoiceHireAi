import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('voicehire_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('voicehire_token');
      if (storedToken) {
        try {
          const res = await api.getMe();
          if (res.user) {
            setUser(res.user);
          }
        } catch (err) {
          console.warn('Session verification failed:', err.message);
          localStorage.removeItem('voicehire_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (credentials) => {
    const res = await api.login(credentials);
    if (res.token && res.user) {
      localStorage.setItem('voicehire_token', res.token);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    }
  };

  const register = async (userData) => {
    const res = await api.register(userData);
    if (res.token && res.user) {
      localStorage.setItem('voicehire_token', res.token);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    }
  };

  const logout = () => {
    try {
      api.logout();
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('voicehire_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isRecruiter: user?.role === 'RECRUITER',
        isCandidate: user?.role === 'CANDIDATE'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
