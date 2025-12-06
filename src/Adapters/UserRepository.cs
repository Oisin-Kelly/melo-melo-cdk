using Domain;
using Ports;

namespace Adapters;

public class UserRepository : IUserRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public UserRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<User?> GetUserByUsername(string username)
    {
        var userDataModel = await _dynamoDbService.GetFromDynamoAsync<UserDataModel>($"USER#{username}", "PROFILE");
        return userDataModel;
    }
}