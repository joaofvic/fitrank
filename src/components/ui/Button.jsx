const variants = {
  primary: 'bg-green-500 hover:bg-green-400 text-black font-bold',
  secondary: 'bg-zinc-800 hover:bg-zinc-700 text-white',
  outline: 'border border-zinc-700 hover:bg-zinc-800 text-white',
  ghost: 'text-zinc-400 hover:text-white'
};

export function Button({
  children,
  onClick,
  className = '',
  variant = 'primary',
  disabled = false
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
