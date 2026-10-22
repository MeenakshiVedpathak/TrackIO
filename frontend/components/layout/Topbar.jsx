import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { toggleSidebar } from '@/store/slices/uiSlice';
import { useTheme } from '@/contexts/ThemeContext';
import UserMenu from './UserMenu';
import DemoVideoModal from '@/components/common/DemoVideoModal';
import { Menu, Sun, Moon, PlayCircle } from 'lucide-react';

const Topbar = ({ title }) => {
  const dispatch = useDispatch();
  const { isDark, toggleTheme } = useTheme();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <header className="shrink-0 sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="flex h-12 items-center gap-2 sm:gap-3 px-3 sm:px-4">

        {/* Sidebar toggle */}
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Brand / page title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold text-foreground truncate">
            {title || 'Trackio | Workforce Intelligence'}
          </span>
        </div>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-2 shrink-0">

          {/* Watch Demo button */}
          <button
            onClick={() => setDemoOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border/60"
            aria-label="Watch demo"
          >
            <PlayCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Watch Demo</span>
          </button>

          <div className="h-5 w-px bg-border shrink-0" />

          {/* Theme toggle — pill style (hidden for now) */}
          {/* <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {isDark
              ? <Sun className="h-4 w-4 text-amber-400" />
              : <Moon className="h-4 w-4" />
            }
          </button>

          <div className="h-5 w-px bg-border" /> */}

          <UserMenu />
        </div>
      </div>

      <DemoVideoModal open={demoOpen} onOpenChange={setDemoOpen} />
    </header>
  );
};

export default Topbar;
