import { Amplify } from 'aws-amplify';

// AWS Cognito configuration for Amplify v6
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_AWS_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID || '',
      loginWith: {
        email: true,
      },
    }
  }
};

// Only configure if we have the required environment variables
if (amplifyConfig.Auth.Cognito.userPoolId && amplifyConfig.Auth.Cognito.userPoolClientId) {
  try {
    Amplify.configure(amplifyConfig, {
      ssr: true
    });
  } catch (error) {
    console.error('Error configuring Amplify:', error);
  }
} else {
  console.warn('AWS Cognito configuration missing. Please set VITE_AWS_USER_POOL_ID and VITE_AWS_USER_POOL_CLIENT_ID environment variables.');
}

export default amplifyConfig;

