import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import ScoresScreen from '../screens/ScoresScreen';
import GameScreen from '../screens/GameScreen';
import TeamsScreen from '../screens/TeamsScreen';
import TeamScreen from '../screens/TeamScreen';
import PlayerScreen from '../screens/PlayerScreen';
import PlayersScreen from '../screens/PlayersScreen';
import DraftScreen from '../screens/DraftScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  Game: { gameId: number; gameDate: string };
  TeamProfile: { teamKey: string; teamCity: string; teamName: string };
  PlayerProfile: { playerId: number };
  Draft: { year: number };
};

export type TabParamList = {
  Scores: undefined;
  Teams: undefined;
  Players: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Scores:  { active: 'basketball',        inactive: 'basketball-outline' },
  Teams:   { active: 'trophy',            inactive: 'trophy-outline' },
  Players: { active: 'person',            inactive: 'person-outline' },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#555555',
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const name = focused ? icons.active : icons.inactive;
          return <Ionicons name={name} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Scores"  component={ScoresScreen} />
      <Tab.Screen name="Teams"   component={TeamsScreen} />
      <Tab.Screen name="Players" component={PlayersScreen} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="Game"
          component={GameScreen}
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#141414' },
            headerTintColor: '#fff',
            headerTitle: '',
            headerBackTitle: 'Games',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="TeamProfile"
          component={TeamScreen}
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#141414' },
            headerTintColor: '#fff',
            headerTitle: '',
            headerBackTitle: 'Teams',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="PlayerProfile"
          component={PlayerScreen}
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#141414' },
            headerTintColor: '#fff',
            headerTitle: '',
            headerBackTitle: 'Roster',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="Draft"
          component={DraftScreen}
          options={({ route }) => ({
            headerShown: true,
            headerStyle: { backgroundColor: '#141414' },
            headerTintColor: '#fff',
            headerTitle: `${(route.params as any).year} NBA Draft`,
            headerTitleStyle: { color: '#fff', fontWeight: '700' },
            headerBackTitle: 'Drafts',
            headerShadowVisible: false,
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderTopColor: '#242424',
    paddingTop: 6,
    paddingBottom: 4,
    height: 60,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
