/**
 * Sam_Att V2 — Authentication Context & Role Management
 * Supports 3 strict roles: ADMIN, RESPONSIBLE_STAFF, GENERAL_USER.
 * Includes interactive persona switcher for effortless GitHub Review testing.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserAccount, UserRole } from '../types/attendance';
import { MOCK_USERS } from '../mock/mockData';

interface AuthContextType {
  currentUser: UserAccount | null;
  isAuthenticated: boolean;
  login: (username: string, role?: UserRole) => boolean;
  logout: () => void;
  switchUser: (userId: string) => void;
  availableUsers: UserAccount[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to RESPONSIBLE_STAFF on load so the dashboard is immediately interactive,
  // while allowing instant switching to GENERAL_USER or ADMIN.
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('sam_att_current_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return MOCK_USERS[1]; // default: staff_patcharee
      }
    }
    return MOCK_USERS[1];
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('sam_att_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('sam_att_current_user');
    }
  }, [currentUser]);

  const login = (username: string): boolean => {
    const user = MOCK_USERS.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (user && user.active) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const switchUser = (userId: string) => {
    const user = MOCK_USERS.find((u) => u.id === userId);
    if (user) {
      setCurrentUser(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
