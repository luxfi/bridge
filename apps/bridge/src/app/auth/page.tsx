'use client';

import React from 'react';
import AuthWizard from '@/components/Wizard/AuthWizard';
import getBridgeSettings from '@/util/getBridgeSettings';
import { redirect } from 'next/navigation';
import { useSettingsContainer } from '@/context/settings';
import { FormWizardProvider } from '@/context/formWizardProvider';
import { AuthStep } from '@/Models/Wizard';
import { SwapDataProvider } from '@/context/swap';
import { BridgeAppSettings } from '@/Models/BridgeAppSettings';

const AuthPage = async () => {
  try {
    const settings = await getBridgeSettings();
    const settingsContainer = useSettingsContainer();

    if (settings && 'error' in settings && settings.error.startsWith('invalid guid')) {
      redirect('/');
    }

    if (settingsContainer) {
      settingsContainer.settings = new BridgeAppSettings(
        settings && 'networks' in settings ? settings : {}
      );
    }

    return (
      <SwapDataProvider>
        <FormWizardProvider initialStep={AuthStep.Email} initialLoading={false}>
          <AuthWizard />
        </FormWizardProvider>
      </SwapDataProvider>
    );
  } catch (e) {
    console.error('Error in AuthPage:', e);
    return null;
  }
};

export default AuthPage;
