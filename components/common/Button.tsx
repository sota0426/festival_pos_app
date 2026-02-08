import { Text, TouchableOpacity, ActivityIndicator } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'thirdy' |'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  size = 'md',
}: ButtonProps) => {
  const baseStyle = 'rounded-lg items-center justify-center flex-row';

  
  const variantStyles = {
    primary: 'bg-blue-600',
    secondary: 'bg-gray-500',
    thirdy:'bg-orange-500',
    danger: 'bg-red-600',
    success: 'bg-green-600',
  };

  const disabledStyle = 'opacity-50';

  const sizeStyles = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  };

  const textSizeStyles = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${disabled ? disabledStyle : ''}`}
      activeOpacity={0.7}
    >
      {loading && <ActivityIndicator color="white" className="mr-2" />}
      <Text className={`text-white font-semibold ${textSizeStyles[size]}`}>{title}</Text>
    </TouchableOpacity>
  );
};
