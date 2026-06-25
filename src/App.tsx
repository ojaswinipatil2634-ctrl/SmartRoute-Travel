/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import Navbar from './components/Navbar';
import AIChat from './components/AIChat';
import Home from './pages/Home';
import Results from './pages/Results';
import RouteOptimization from './pages/RouteOptimization';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import Success from './pages/Success';
import { motion, AnimatePresence } from 'motion/react';
import { TravelProvider } from './lib/TravelContext';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <TravelProvider>
      <BrowserRouter>
        <div className="app-shell">
          <div className="mobile-screen">
            <Navbar user={user} />
            <main className="flex-1 pb-32 overflow-y-auto no-scrollbar">
              <AnimatePresence mode="wait">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/results" element={<Results />} />
                  <Route path="/route" element={<RouteOptimization />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/assistant" element={<AIChat />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/success" element={<Success />} />
                </Routes>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </TravelProvider>
  );
}

