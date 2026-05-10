import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSession, login, logout, register } from './api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const u = await getSession();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    getSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = async (data) => {
    const u = await login(data);
    setUser(u);
    return u;
  };

  const handleRegister = async (data) => {
    const u = await register(data);
    setUser(u);
    return u;
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
        refreshSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
