using Domain;

namespace Ports;

public interface IUserValidationService
{
    void ValidateUsername(string username);
    Task ValidateEmail(string email, string userPoolId);
    Task<User> ValidateUser(User user);
}