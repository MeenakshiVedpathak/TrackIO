import { Navigate, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

const AuthLayout = () => {
  const { isAuthenticated, homeRoute } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={homeRoute} replace />;
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[52%] bg-sidebar relative flex-col justify-between p-12 overflow-hidden">
        {/* Decorative gradient orbs */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

        <motion.div
          className="relative z-10 flex items-center gap-3"
          initial={{ opacity: 0, y: -14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <motion.img
            src="/logo.svg"
            alt="Logo"
            className="h-24 object-contain"
            animate={{
              scale: [1, 1.12, 1],
              rotate: [0, 1.2, 0, -1.2, 0],
              filter: [
                'drop-shadow(0 0 6px rgba(139,92,246,0.5))',
                'drop-shadow(0 0 22px rgba(37,99,235,0.75))',
                'drop-shadow(0 0 6px rgba(139,92,246,0.5))',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Center copy */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Manage resources,<br />
            track costs,<br />
            <span className="text-primary-foreground/70 text-3xl">deliver results.</span>
          </h1>
          <p className="text-white/60 text-base max-w-xs leading-relaxed">
            A unified platform for workforce planning, service PO tracking, and financial reporting across your organization.
          </p>
          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            {['Timesheet Import', 'Service PO Tracking', 'Cost Analytics', 'Role-Based Access'].map((f) => (
              <span
                key={f}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative z-10 text-xs text-white/30">
          © {new Date().getFullYear()} GTT Data Solutions Ltd. All Rights Reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-12">
        <motion.div
          className="mb-8 flex items-center justify-center lg:hidden"
          initial={{ opacity: 0, y: -14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <motion.img
            src="/logo.svg"
            alt="Logo"
            className="h-16 object-contain"
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 1, 0, -1, 0],
              filter: [
                'drop-shadow(0 0 4px rgba(139,92,246,0.35))',
                'drop-shadow(0 0 14px rgba(37,99,235,0.5))',
                'drop-shadow(0 0 4px rgba(139,92,246,0.35))',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
