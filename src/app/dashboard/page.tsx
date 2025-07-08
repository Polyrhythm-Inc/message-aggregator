'use client';

import { useEffect, useState } from 'react';
import { checkAuthStatus, logout, getClientLoginUrl } from '@polyrhythm-inc/nextjs-auth-client';

interface User {
  id: string;
  email: string;
  name?: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus()
      .then((userData) => {
        if (userData) {
          setUser(userData as User);
        } else {
          window.location.href = getClientLoginUrl();
        }
      })
      .catch((error) => {
        console.error('Auth check failed:', error);
        window.location.href = getClientLoginUrl();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      const success = await logout();
      if (success) {
        const loginUrl = getClientLoginUrl();
        window.location.href = loginUrl;
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Dashboard</h1>
              
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-2">User Information</h2>
                <div className="bg-gray-50 px-4 py-3 rounded-md">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Email:</span> {user.email}
                  </p>
                  {user.name && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">Name:</span> {user.name}
                    </p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">User ID:</span> {user.id}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}