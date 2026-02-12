
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Branch } from '../../../../types/database';

import { ManualCounter } from './ManualCounter';
import { useVisitorCounter } from 'hooks/useVisitorCounter';
import { VisitorHeader } from './VisitorScreen+Header';
import { VisitorFooter } from './VisitorScreen+Footer';
import { View } from 'react-native';

interface Props {
  branch: Branch;
  onBack: () => void;
}

export const ManualCounterScreen = ({ branch, onBack }: Props) => {
 
  const {
    todayCount,
    handleCount,
  } = useVisitorCounter(branch.id);

  return (
    <SafeAreaView className="flex-1 bg-purple-50" edges={['top']}>

      <VisitorHeader 
        branch={branch}
        onBack={onBack}
      />



      <View className="flex justify-center mt-auto">
        <ManualCounter
          todayCount={todayCount}
          onCount={handleCount}
        />

      </View>

      <VisitorFooter 
        branch={branch}
      />
      
    </SafeAreaView>
  );
};
