import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserAccount } from '../types/attendance';
import { apiAttendanceAdapter, BackendAuthenticatedUser } from '../services/apiAttendanceAdapter';
import { getDemoAdminUser } from '../config/demoModeConfig';

interface AuthContextType {
  currentUser: UserAccount | null;
  isLoadingAuth: boolean;
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_SESSION_STORAGE_KEY = 'sam_att_current_user';

function mapBackendUserToFrontendUser(u: BackendAuthenticatedUser): UserAccount {
  return {
    id: u.userId || u.id || u.username,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    personId: u.personId ?? null,
    department: u.department || '',
    position: u.position || '',
    active: true,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const clearAuthSession = useCallback(() => {
    apiAttendanceAdapter.setAuthToken(null);
    try {
      localStorage.removeItem(USER_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    setIsDemoMode(false);
    setCurrentUser(null);
  }, []);

  const enterDemoMode = useCallback(() => {
    if (import.meta.env.DEV && !import.meta.env.PROD) {
      const demoUser = getDemoAdminUser();
      if (demoUser) {
        apiAttendanceAdapter.setAuthToken(null);
        setIsDemoMode(true);
        setCurrentUser(demoUser);
      }
    }
  }, []);

  const exitDemoMode = useCallback(() => {
    if (import.meta.env.DEV && !import.meta.env.PROD) {
      setIsDemoMode(false);
      setCurrentUser(null);
    }
  }, []);

  // Validate stored Bearer token on startup via GET /api/Sam_Att/auth/me
  useEffect(() => {
    let isMounted = true;

    const validateStoredSession = async () => {
      const token = apiAttendanceAdapter.getAuthToken();
      if (!token) {
        clearAuthSession();
        if (import.meta.env.DEV && !import.meta.env.PROD) {
          const demoUser = getDemoAdminUser();
          if (demoUser && isMounted) {
            setIsDemoMode(true);
            setCurrentUser(demoUser);
          }
        }
        if (isMounted) setIsLoadingAuth(false);
        return;
      }

      try {
        const backendUser = await apiAttendanceAdapter.fetchCurrentUser();
        if (isMounted) {
          const mappedUser = mapBackendUserToFrontendUser(backendUser);
          setIsDemoMode(false);
          setCurrentUser(mappedUser);
          try {
            localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(mappedUser));
          } catch {
            // Ignore storage error
          }
        }
      } catch {
        if (isMounted) {
          clearAuthSession();
          if (import.meta.env.DEV && !import.meta.env.PROD) {
            const demoUser = getDemoAdminUser();
            if (demoUser) {
              setIsDemoMode(true);
              setCurrentUser(demoUser);
            }
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      }
    };

    void validateStoredSession();

    const handleUnauthorized = () => {
      if (isMounted) {
        clearAuthSession();
      }
    };

    window.addEventListener('sam-att-auth-unauthorized', handleUnauthorized);
    return () => {
      isMounted = false;
      window.removeEventListener('sam-att-auth-unauthorized', handleUnauthorized);
    };
  }, [clearAuthSession]);

  const login = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      return {
        success: false,
        error: 'กรุณาระบุชื่อผู้ใช้งาน (Username) และรหัสผ่าน (Password)',
      };
    }

    const res = await apiAttendanceAdapter.login(trimmedUsername, password);
    if (!res.success || !res.user || !res.token) {
      return {
        success: false,
        error: res.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง',
      };
    }

    const mappedUser = mapBackendUserToFrontendUser(res.user);
    setIsDemoMode(false);
    setCurrentUser(mappedUser);
    try {
      localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(mappedUser));
    } catch {
      // Ignore storage error
    }
    return { success: true };
  };

  const logout = async (): Promise<void> => {
    if (isDemoMode) {
      exitDemoMode();
      return;
    }
    await apiAttendanceAdapter.logout();
    clearAuthSession();
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoadingAuth,
        isDemoMode,
        enterDemoMode,
        exitDemoMode,
        login,
        logout,
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
