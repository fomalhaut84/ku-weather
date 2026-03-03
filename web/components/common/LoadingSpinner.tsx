interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ message, fullScreen = false }: LoadingSpinnerProps) {
  const containerClass = fullScreen
    ? 'flex min-h-screen items-center justify-center'
    : 'flex items-center justify-center py-12';

  return (
    <div className={containerClass}>
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
        {message && <p className="mt-4 text-gray-600">{message}</p>}
      </div>
    </div>
  );
}
