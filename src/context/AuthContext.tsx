import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserAccount } from '../types/attendance';
import { MOCK_USERS } from '../mock/mockData';

interface AuthContextType {
  currentUser: UserAccount | null;
  login: (username: string) => boolean;
  logout: () => void;
  switchUser: (userId: string) => void;
  availableUsers: UserAccount[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Default logged in as ADMIN for immediate evaluation; can switch or logout anytime
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(MOCK_USERS[0]);

  const login = (username: string): boolean => {
    const found = MOCK_USERS.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.active
    );
    if (found) {
      setCurrentUser(found);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const switchUser = (userId: string) => {
    const found = MOCK_USERS.find((u) => u.id === userId && u.active);
    if (found) {
      setCurrentUser(found);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        logout,
        switchUser,
        availableUsers: MOCK_USERS,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
