using Domain;

namespace Ports;

public interface IUserRepository
{
    public Task<User?> GetUserByUsername(string username);
}