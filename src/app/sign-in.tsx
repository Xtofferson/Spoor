import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';

/** Supabase's default minimum password length. */
const MIN_PASSWORD_LENGTH = 6;

export default function SignInScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';
  const canSubmit = email.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp(credentials);
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        // Email confirmation is on: Supabase sent a link and there's no session yet.
        setNotice('Check your email and tap the confirmation link, then sign in here.');
        setMode('sign-in');
        setPassword('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) setError(error.message);
    }
    // On success the auth listener swaps this screen for the tabs.
    setBusy(false);
  }

  function switchMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setError(null);
    setNotice(null);
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <ThemedText type="title" style={{ color: theme.accent }}>
                Spoor
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {isSignUp ? 'Create an account to sync your trips.' : 'Sign in to see your trips.'}
              </ThemedText>
            </View>

            <View style={styles.fields}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                accessibilityLabel="Email"
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={isSignUp ? `Password (at least ${MIN_PASSWORD_LENGTH} characters)` : 'Password'}
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                textContentType={isSignUp ? 'newPassword' : 'password'}
                returnKeyType="go"
                onSubmitEditing={submit}
                accessibilityLabel="Password"
              />
            </View>

            {error && (
              <ThemedText type="small" style={styles.error} accessibilityRole="alert">
                {error}
              </ThemedText>
            )}
            {notice && (
              <ThemedText type="small" style={{ color: theme.accent }} accessibilityRole="alert">
                {notice}
              </ThemedText>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy }}
              disabled={!canSubmit}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.accent },
                !canSubmit && styles.disabled,
                pressed && styles.pressed,
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {isSignUp ? 'Create account' : 'Sign in'}
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={switchMode}
              style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="textSecondary">
                {isSignUp ? 'Already have an account? ' : 'New to Spoor? '}
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  {isSignUp ? 'Sign in' : 'Create an account'}
                </ThemedText>
              </ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  fields: {
    gap: Spacing.two,
  },
  input: {
    fontSize: 16,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  error: {
    color: '#B42318',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: Spacing.four,
    marginTop: Spacing.two,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
