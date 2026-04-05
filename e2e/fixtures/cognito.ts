import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
    SignUpCommand,
    AdminConfirmSignUpCommand,
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
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;
    const clientId = process.env.COGNITO_CLIENT_ID!;

    let userExists = false;
    try {
        await client.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: account.username }));
        userExists = true;
    } catch {
        // UserNotFoundException
    }

    if (!userExists) {
        await client.send(
            new SignUpCommand({
                ClientId: clientId,
                Username: account.username,
                Password: account.password,
                UserAttributes: [{ Name: 'email', Value: `${account.username}@melo-e2e.invalid` }],
            })
        );

        // Triggers PostConfirmation Lambda → creates DynamoDB profile
        await client.send(
            new AdminConfirmSignUpCommand({ UserPoolId: userPoolId, Username: account.username })
        );
    }

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
}
