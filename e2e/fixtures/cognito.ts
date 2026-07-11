import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
    AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';

export interface TestAccount {
    username: string;
    password: string;
}

export interface TestUser {
    username: string;
    idToken: string;
}

function getClient() {
    return new CognitoIdentityProviderClient({
        region: process.env.AWS_REGION ?? 'eu-west-1',
    });
}

export async function signIn(account: TestAccount): Promise<TestUser> {
    const client = getClient();
    const clientId = process.env.COGNITO_CLIENT_ID!;

    try {
        const authResult = await client.send(
            new InitiateAuthCommand({
                AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
                ClientId: clientId,
                AuthParameters: {
                    USERNAME: account.username,
                    PASSWORD: account.password,
                },
            })
        );

        return {
            username: account.username,
            idToken: authResult.AuthenticationResult!.IdToken!,
        };
    } catch (e) {
        const name = (e as Error).name;
        if (name === 'UserNotFoundException' || name === 'NotAuthorizedException') {
            throw new Error(
                `Test user '${account.username}' cannot sign in — run e2e/setup-test-users.sh ` +
                    'to provision the test users first.'
            );
        }
        throw e;
    }
}
