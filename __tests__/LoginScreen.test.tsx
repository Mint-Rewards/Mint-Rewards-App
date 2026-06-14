/// <reference types="jest" />

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import LoginScreen from '../app/login';

describe('Login Screen', () => {
  it('renders the login button', async () => {
    await render(<LoginScreen />);
    expect(screen.getByText('Login')).toBeTruthy();
  });

  it('renders the Google Sign-In button', async () => {
    await render(<LoginScreen />);
    expect(screen.getByText('Sign in with Google')).toBeTruthy();
  });
});