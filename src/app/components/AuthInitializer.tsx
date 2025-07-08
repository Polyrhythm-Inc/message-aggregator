'use client';
import { useEffect } from 'react';
import { initializeAuthConfig } from '@polyrhythm-inc/nextjs-auth-client';

export default function AuthInitializer() {
  useEffect(() => {
    initializeAuthConfig({
      enableDebugLog: process.env.NODE_ENV === 'development'
    });
  }, []);

  return null;
}