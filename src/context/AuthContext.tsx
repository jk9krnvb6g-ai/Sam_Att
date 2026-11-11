import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { UserAccount } from '../types/attendance';
import {
  apiAttendanceAdapter,
  ApiRequestError,
  BackendAuthenticatedUser,
  extractSafeErrorMessage,
} from '../services/apiAttendanceAdapter';
import { getDemoAdminUser } from '../config/demoModeConfig';

interface AuthContextType {
  currentUser: UserAccount | null;
  isLoadingAuth: boolean;
  isDemoMode: boolean;
  authError: string | null;
  clearAuthError: () => void;
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
  const [authError, setAuthError] = useState<string | null>(null);
  const hasValidatedStartupRef = useRef<boolean>(false);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

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
        setAuthError(null);
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

  // Validate stored Bearer token on startup via GET /api/Sam_Att/auth/me (at most once)
  useEffect(() => {
    let isMounted = true;

    const validateStoredSession = async () => {
      if (hasValidatedStartupRef.current) {
        if (isMounted) setIsLoadingAuth(false);
        return;
      }
      hasValidatedStartupRef.current = true;

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
          setAuthError(null);
          setIsDemoMode(false);
          setCurrentUser(mappedUser);
          try {
            localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(mappedUser));
          } catch {
            // Ignore storage error
          }
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof ApiRequestError && err.isRateLimit) {
            setAuthError(
              extractSafeErrorMessage(
                err,
                'ระบบถูกเรียกใช้งานถี่เกินกำหนด กรุณารอสักครู่แล้วลองใหม่'
              )
            );
          }
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
    setAuthError(null);
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      return {
        success: false,
        error: 'กรุณาระบุชื่อผู้ใช้งาน (Username) และรหัสผ่าน (Password)',
      };
    }

    const res = await apiAttendanceAdapter.login(trimmedUsername, password);
    if (!res.success || !res.user || !res.token) {
      const normalizedError = extractSafeErrorMessage(
        res.error,
        'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      );
      return {
        success: false,
        error: normalizedError,
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
    setAuthError(null);
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
        authError,
        clearAuthError,
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

