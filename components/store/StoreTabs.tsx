import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Branch } from 'types/database';

const Tab = createBottomTabNavigator();

interface Props{
  branch:Branch;
  onLogout:()=>void;
}

export const StoreTabs=({
  branch,
  onLogout
}:Props)=>{
  return(
    <Tab.Navigator 
      screenOptions={{headerShown:false}}
    >
      <Tab.Screen name="Main">
        {()=> (
          <MainTabScreen 
            branch={branch}
          />)}
      </Tab.Screen>

      <Tab.Screen name="Sub">
        {()=> <SubTabScreen />}
      </Tab.Screen>
      
      <Tab.Screen name="Setting">
        {()=> (
          <SettingTabScreen 
            branch={branch}
            onLogout={onLogout}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  )
}