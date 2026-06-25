import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { MapPin, User as UserIcon, LogOut, Search, LayoutDashboard, Home, Route, Compass, ChevronLeft, MessageSquare, ArrowUp } from 'lucide-react';
import { motion } from 'motion/react';

interface NavbarProps {
  user: User | null;
}

export default function Navbar({ user }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const loggedInUser = result.user;

      // Save user profile to Firestore
      await setDoc(doc(db, 'users', loggedInUser.uid), {
        uid: loggedInUser.uid,
        email: loggedInUser.email,
        displayName: loggedInUser.displayName,
        photoURL: loggedInUser.photoURL,
        createdAt: serverTimestamp(),
      }, { merge: true });

    } catch (error: any) {
      console.error("Login failed", error);
      let errorMessage = "Login failed: " + error.message;
      
      if (error.code === 'auth/unauthorized-domain') {
        errorMessage = `Domain Unauthorized: Please add the following domains to your Firebase Console (Authentication > Settings > Authorized domains):\n\n1. ${window.location.hostname}\n2. ais-pre-rgztpwb6iy43u3sorplj64-168702672325.asia-southeast1.run.app\n3. ais-dev-rgztpwb6iy43u3sorplj64-168702672325.asia-southeast1.run.app`;
        // We'll log it to console for the user to copy easily
        console.error("AUTHORIZED DOMAINS NEEDED:", [
          window.location.hostname,
          "ais-pre-rgztpwb6iy43u3sorplj64-168702672325.asia-southeast1.run.app",
          "ais-dev-rgztpwb6iy43u3sorplj64-168702672325.asia-southeast1.run.app"
        ]);
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = "Login failed: Popup was blocked by your browser. Please allow popups for this site and try again.";
      }
      
      // Since we shouldn't use window.alert, we'll log it and maybe show a toast if we had one.
      // For now, we'll use a simple console error and let the user know in the chat.
      console.error(errorMessage);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const navItems = [
    { path: '/', icon: Compass, label: 'Explore' },
    { path: '/route', icon: Route, label: 'Smart Travel' },
    { path: '/assistant', icon: MessageSquare, label: 'Assistant' },
    { path: '/profile', icon: UserIcon, label: 'Your Booking' },
  ];

  const isMainTab = ['/', '/route', '/assistant', '/profile'].includes(location.pathname);

  return (
    <>
      {/* Mobile Top Header (Back Button) - Adjusted top positioning */}
      <div className="absolute top-6 left-0 right-0 px-6 flex items-center justify-between z-40 pointer-events-none max-w-[430px] mx-auto">
        {isMainTab ? (
          <div className="w-10 h-10" /> // Spacer for alignment
        ) : (
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/90 backdrop-blur-md border border-slate-100 rounded-2xl flex items-center justify-center text-brand-secondary pointer-events-auto shadow-lg active:scale-95 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {!user && (
          <div className="relative pointer-events-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: [0, -5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute -bottom-10 right-4 flex flex-col items-center gap-1"
            >
              <ArrowUp size={16} className="text-brand-secondary" />
              <span className="text-[8px] font-black text-brand-secondary uppercase whitespace-nowrap bg-white px-2 py-1 rounded-lg shadow-sm border border-slate-100">Click here</span>
            </motion.div>
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className={`px-4 py-2 bg-brand-secondary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoggingIn ? 'Updating...' : 'User Info'}
            </button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-6 left-0 right-0 px-6 z-50 pointer-events-none max-w-[430px] mx-auto">
        <div className="bg-brand-secondary/95 backdrop-blur-xl rounded-[32px] p-2 flex items-center justify-between shadow-2xl shadow-brand-secondary/20 border border-white/10 pointer-events-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center py-2 px-4 rounded-2xl transition-all duration-300 ${
                  isActive ? 'bg-brand-primary text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                <item.icon size={20} className={isActive ? 'scale-110' : ''} />
                {isActive && (
                  <motion.span 
                    layoutId="nav-label"
                    className="text-[8px] font-black uppercase tracking-widest mt-1"
                  >
                    {item.label}
                  </motion.span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
