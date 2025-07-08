'use client';

// import { initializeAuthConfig } from '@polyrhythm-inc/nextjs-auth-client';
import { useEffect } from 'react';

export default function AuthInitializer() {
  useEffect(() => {
    // Simplified initialization for Heroku deployment
    console.log('AuthInitializer loaded');
  }, []);

  return null;
}