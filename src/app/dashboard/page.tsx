'use client';

import { useState } from 'react';
// import { checkAuthStatus, logout, getClientLoginUrl } from '@polyrhythm-inc/nextjs-auth-client';

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<{
    isAuthenticated: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const handleCheckAuth = async () => {
    setIsLoading(true);
    try {
      // Simplified for Heroku deployment
      console.log('Auth check disabled for deployment');
      setAuthStatus({ isAuthenticated: false, message: 'Auth disabled for deployment' });
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthStatus({ isAuthenticated: false, error: 'Auth check failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      // Simplified for Heroku deployment
      console.log('Logout disabled for deployment');
      setAuthStatus(null);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    // Simplified for Heroku deployment
    console.log('Login disabled for deployment');
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Message Aggregator Dashboard (Simplified for Heroku)
          </p>
        </div>

        <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
          <div className="flex flex-col space-y-2">
            <button
              onClick={handleCheckAuth}
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? 'Checking...' : 'Check Auth Status'}
            </button>

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Login
            </button>

            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Logout
            </button>
          </div>

          {authStatus && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Auth Status:</h3>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {JSON.stringify(authStatus, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}