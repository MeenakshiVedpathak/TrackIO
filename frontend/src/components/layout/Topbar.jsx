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
      {/* min-h-12 (not a hard h-12): the user-menu trigger below (UserMenu.jsx) stacks up to 3
          text lines — name, Business Unit, role — which already run taller than 48px in the
          ordinary case (a single-BU employee shows both the BU line and the role line). A fixed
          h-12 just centered that overflow instead of containing it, so the card visibly spilled
          past this header's own border-b on affected accounts. min-h lets the row grow to fit its
          tallest child while still being exactly 48px everywhere nothing taller is present. */}
      <div className="flex min-h-12 items-center gap-2 sm:gap-3 px-3 sm:px-4">

        {/* Sidebar toggle — fluid clamp() sizing (see ui/button.jsx's own comment) instead of a
            fixed h-8/h-4, so this whole bar shrinks smoothly with the viewport. */}
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="flex h-[clamp(1.75rem,3.2vw,2rem)] w-[clamp(1.75rem,3.2vw,2rem)] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-[clamp(0.875rem,1.1vw,1rem)] w-[clamp(0.875rem,1.1vw,1rem)]" />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Brand / page title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[clamp(0.9375rem,1.4vw,1.125rem)] font-bold text-foreground truncate">
            {title || 'Trackio | Workforce Intelligence'}
          </span>
        </div>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-2 shrink-0">

          {/* Watch Demo button */}
          <button
            onClick={() => setDemoOpen(true)}
            className="flex items-center gap-1.5 h-[clamp(1.75rem,3.2vw,2rem)] px-[clamp(0.5rem,0.85vw,0.75rem)] rounded-lg text-[clamp(0.6875rem,0.85vw,0.75rem)] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border/60"
            aria-label="Watch demo"
          >
            <PlayCircle className="h-[clamp(0.75rem,0.95vw,0.875rem)] w-[clamp(0.75rem,0.95vw,0.875rem)] shrink-0" />
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
