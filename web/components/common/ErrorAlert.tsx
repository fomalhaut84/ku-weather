interface ErrorAlertProps {
  message: string;
  className?: string;
}

export default function ErrorAlert({ message, className = '' }: ErrorAlertProps) {
  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`.trim()}>
      <p className="text-red-600">{message}</p>
    </div>
  );
}
