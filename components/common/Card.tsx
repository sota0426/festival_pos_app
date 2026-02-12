import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card = ({ children, className = '' }: CardProps) => {
  return (
    <View
          className={`rounded-xl p-4 shadow-sm border border-gray-100 justify-center  ${className}`}
        >
      {children}
    </View>
  );
};
