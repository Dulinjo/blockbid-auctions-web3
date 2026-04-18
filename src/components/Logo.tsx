import { Link } from "react-router-dom";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2.5 group ${className}`}>
    <div className="relative h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center glow-primary group-hover:scale-110 transition-transform duration-300">
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-primary-foreground">
        <path
          d="M4 6L12 2L20 6V18L12 22L4 18V6Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 2V12L20 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 12L4 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 12V22" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
    <span className="text-xl font-bold tracking-tight">
      Block<span className="text-gradient-primary">Bid</span>
    </span>
  </Link>
);
