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

    public Task<User?> GetUserByUsername(string username)
    {
        return _dynamoDbService.GetFromDynamoAsync<User>($"USER#{username}", "PROFILE");
    }
}