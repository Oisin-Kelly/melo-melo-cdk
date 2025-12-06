using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Ports;

namespace Adapters;

public class UserPoolService : IUserPoolService
{
    private readonly string _userPoolId;
    private readonly IAmazonCognitoIdentityProvider _cognitoIdentityProvider;
    
    public UserPoolService(IAmazonCognitoIdentityProvider provider, string userPoolId)
    {
        _cognitoIdentityProvider = provider;
        _userPoolId = userPoolId;
    }
    
    public async Task<bool> EmailExistsInUserPool(string email)
    {
        var request = new ListUsersRequest
        {
            UserPoolId = _userPoolId,
            Limit = 1
        };

        var listUsersResponse = await _cognitoIdentityProvider.ListUsersAsync(request);
        return listUsersResponse != null && listUsersResponse.Users.Count > 0;
    }
}