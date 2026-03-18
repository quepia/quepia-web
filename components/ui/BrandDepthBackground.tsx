import { cn } from '@/lib/sistema/utils';

interface BrandDepthBackgroundProps {
  variant?: 'default' | 'subtle';
  className?: string;
}

export default function BrandDepthBackground({
  variant = 'default',
  className,
}: BrandDepthBackgroundProps) {
  return (
    <div
      className={cn(
        'brand-depth-bg',
        variant === 'subtle' && 'brand-depth-bg-subtle',
        className,
      )}
      aria-hidden="true"
    >
      <div className="brand-depth-orb brand-depth-orb-cyan" />
      <div className="brand-depth-orb brand-depth-orb-purple" />
      {variant === 'subtle' ? <div className="brand-depth-halo" /> : null}
      <div className="brand-depth-vignette" />
    </div>
  );
}
