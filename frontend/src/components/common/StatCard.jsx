import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const GRADIENT_STYLES = {
  blue:   { bg: '#eff3ff', border: '#bfcfff', accent: '#4f6ef7' },
  green:  { bg: '#edfaf3', border: '#a3e6c4', accent: '#22a05a' },
  amber:  { bg: '#fffbea', border: '#fde68a', accent: '#d97706' },
  orange: { bg: '#fff5ed', border: '#fdc89a', accent: '#ea6c20' },
  red:    { bg: '#fff1f1', border: '#fdb8b8', accent: '#dc2626' },
  purple: { bg: '#f5f0ff', border: '#d4b8ff', accent: '#7c3aed' },
  cyan:   { bg: '#ecfbff', border: '#a5e6f5', accent: '#0891b2' },
};

const TipText = ({ text, className, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className={cn('block truncate cursor-default', className)}>{children ?? text}</span>
    </TooltipTrigger>
    <TooltipContent side="top"><span>{text}</span></TooltipContent>
  </Tooltip>
);

const StatCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  description,
  gradient,
  isLoading,
  className,
}) => {
  if (isLoading) {
    return (
      <Card className={cn(className)}>
        <CardContent className="pl-4 pr-3 py-3">
          <Skeleton className="h-3 w-24 mb-2" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-16 mt-1.5" />
        </CardContent>
      </Card>
    );
  }

  const trendIsPositive = trend > 0;
  const trendIsNeutral = trend === 0 || trend == null;
  const TrendIcon = trendIsNeutral ? Minus : trendIsPositive ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card
        className={cn('relative overflow-hidden', className)}
        style={gradient && GRADIENT_STYLES[gradient] ? {
          backgroundColor: GRADIENT_STYLES[gradient].bg,
          borderColor: GRADIENT_STYLES[gradient].border,
        } : undefined}
      >
        {/* Colored left accent bar */}
        {gradient && GRADIENT_STYLES[gradient] && (
          <div
            className="absolute left-0 inset-y-0 w-1 pointer-events-none"
            style={{ backgroundColor: GRADIENT_STYLES[gradient].accent }}
          />
        )}
        <CardContent className="pl-4 pr-3 py-3">
          {/* Title — full width, no icon competing */}
          <TipText text={title} className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide leading-none" />
          {/* Value row: value on left, icon on right */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <TipText
                text={String(value)}
                className={cn(
                  'font-bold tabular-nums leading-tight',
                  String(value).length > 12 ? 'text-sm' : String(value).length > 8 ? 'text-base' : 'text-[1.1rem]'
                )}
              />
              {description && (
                <TipText text={description} className="mt-0.5 text-[11px] text-muted-foreground leading-tight" />
              )}
              {trend != null && (
                <div className={cn(
                  'mt-1 inline-flex items-center gap-1 text-xs font-medium',
                  trendIsNeutral ? 'text-muted-foreground' : trendIsPositive ? 'text-success' : 'text-destructive'
                )}>
                  <TrendIcon className="h-3 w-3" />
                  <span>{trendIsPositive ? '+' : ''}{trend}%</span>
                  {trendLabel && <span className="text-muted-foreground font-normal">{trendLabel}</span>}
                </div>
              )}
            </div>
            {Icon && (
              <div
                className="flex h-8 w-8 shrink-0 self-start items-center justify-center rounded-lg text-white"
                style={gradient && GRADIENT_STYLES[gradient]
                  ? { backgroundColor: GRADIENT_STYLES[gradient].accent }
                  : { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }
                }
              >
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default StatCard;
