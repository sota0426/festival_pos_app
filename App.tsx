import { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { Home } from './components/Home';
import { HQLogin, HQDashboard, BranchManagement } from './components/hq';
import { BranchLogin, StoreHome, MenuManagement, Register, SalesHistory, VisitorCounter } from './components/store';
import { useSync } from './hooks/useSync';
import type { Branch } from './types/database';

type Screen =
  | 'home'
  | 'hq_login'
  | 'hq_dashboard'
  | 'hq_branches'
  | 'store_login'
  | 'store_home'
  | 'store_menus'
  | 'store_register'
  | 'store_history'
  | 'store_counter';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);

  // Initialize sync
  useSync();

  const handleBranchLogin = useCallback((branch: Branch) => {
    setCurrentBranch(branch);
    setCurrentScreen('store_home');
  }, []);

  const handleBranchLogout = useCallback(() => {
    setCurrentBranch(null);
    setCurrentScreen('home');
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return (
          <Home
            onNavigateToStore={() => setCurrentScreen('store_login')}
            onNavigateToHQ={() => setCurrentScreen('hq_login')}
          />
        );

      // HQ Screens
      case 'hq_login':
        return (
          <HQLogin
            onLoginSuccess={() => setCurrentScreen('hq_dashboard')}
            onBackToHome={() => setCurrentScreen('home')}
          />
        );

      case 'hq_dashboard':
        return (
          <HQDashboard
            onNavigateToBranches={() => setCurrentScreen('hq_branches')}
            onLogout={() => setCurrentScreen('home')}
          />
        );

      case 'hq_branches':
        return <BranchManagement onBack={() => setCurrentScreen('hq_dashboard')} />;

      // Store Screens
      case 'store_login':
        return (
          <BranchLogin
            onLoginSuccess={handleBranchLogin}
            onBackToHome={() => setCurrentScreen('home')}
          />
        );

      case 'store_home':
        if (!currentBranch) {
          return null;
        }
        return (
          <StoreHome
            branch={currentBranch}
            onNavigateToRegister={() => setCurrentScreen('store_register')}
            onNavigateToMenus={() => setCurrentScreen('store_menus')}
            onNavigateToHistory={() => setCurrentScreen('store_history')}
            onNavigateToCounter={() => setCurrentScreen('store_counter')}
            onLogout={handleBranchLogout}
          />
        );

      case 'store_menus':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <MenuManagement
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      case 'store_register':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <Register
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
            onNavigateToHistory={() => setCurrentScreen('store_history')}
          />
        );

      case 'store_history':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <SalesHistory
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      case 'store_counter':
        if (!currentBranch) {
          setCurrentScreen('store_login');
          return null;
        }
        return (
          <VisitorCounter
            branch={currentBranch}
            onBack={() => setCurrentScreen('store_home')}
          />
        );

      default:
        return (
          <Home
            onNavigateToHQ={() => setCurrentScreen('hq_login')}
            onNavigateToStore={() => setCurrentScreen('store_login')}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      {renderScreen()}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
