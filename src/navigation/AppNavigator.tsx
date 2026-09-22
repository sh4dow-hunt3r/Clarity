import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DashboardScreen from '../screens/DashboardScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import ExportScreen from '../screens/ExportScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TransactionsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#1976D2',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="TransactionsList"
        component={TransactionsScreen}
        options={{ title: 'Transactions' }}
      />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={({ route }: any) => ({
          title: route.params?.transaction ? 'Edit Transaction' : 'Add Transaction',
        })}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarActiveTintColor: '#1976D2',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 8,
            height: 60,
            paddingBottom: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1976D2',
          headerTitleStyle: { fontWeight: '700' },
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, string> = {
              Dashboard: 'view-dashboard',
              Transactions: 'receipt',
              Export: 'export',
            };
            return (
              <MaterialCommunityIcons
                name={icons[route.name] as any}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Dashboard' }}
        />
        <Tab.Screen
          name="Transactions"
          component={TransactionsStack}
          options={{ headerShown: false }}
        />
        <Tab.Screen
          name="Export"
          component={ExportScreen}
          options={{ title: 'Export' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
