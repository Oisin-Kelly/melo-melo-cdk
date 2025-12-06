using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Ports;

namespace Adapters;

public class UserPoolService : IUserPoolService
{
    private readonly IAmazonCognitoIdentityProvider _cognitoIdentityProvider;

    public UserPoolService(IAmazonCognitoIdentityProvider provider)
    {
        _cognitoIdentityProvider = provider;
    }

    public async Task<bool> EmailExistsInUserPool(string email, string userPoolId)
    {
        var request = new ListUsersRequest
        {
            UserPoolId = userPoolId,
            Filter = $"email = \"{email}\"",
            Limit = 1
        };

        var listUsersResponse = await _cognitoIdentityProvider.ListUsersAsync(request);
        return listUsersResponse != null && listUsersResponse.Users.Count > 0;
    }
}