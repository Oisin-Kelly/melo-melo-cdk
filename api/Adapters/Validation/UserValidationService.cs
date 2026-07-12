using System.Text.RegularExpressions;
using Domain;
using FluentValidation;
using Ports.Services;
using Ports.Validation;

namespace Adapters.Validation;

internal class UserValidator : AbstractValidator<User>
{
    public UserValidator()
    {
        RuleFor(x => x.DisplayName).MaximumLength(30);
        RuleFor(x => x.Bio).MaximumLength(2000);
        RuleFor(x => x.FirstName).MaximumLength(35);
        RuleFor(x => x.LastName).MaximumLength(35);
        RuleFor(x => x.City).MaximumLength(35);
        RuleFor(x => x.Country).MaximumLength(35);
    }
}

public sealed partial class UserValidationService : IUserValidationService
{
    private static readonly UserValidator Validator = new();

    private readonly IUserPoolService _userPoolService;

    [GeneratedRegex("^[a-zA-Z0-9._]{2,30}$", RegexOptions.Compiled)]
    private static partial Regex UsernameRegex();

    [GeneratedRegex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex EmailRegex();

    public UserValidationService(IUserPoolService userPoolService)
    {
        _userPoolService = userPoolService;
    }

    public void ValidateUsername(string username)
    {
        var isValid = !string.IsNullOrWhiteSpace(username) && UsernameRegex().IsMatch(username);
        if (!isValid)
            throw new ArgumentException("Username is invalid");
    }

    public async Task ValidateEmail(string email, string userPoolId)
    {
        var isValid = !string.IsNullOrWhiteSpace(email) && EmailRegex().IsMatch(email);
        if (!isValid)
            throw new ArgumentException("Email is invalid");

        var userInUserPool = await _userPoolService.EmailExistsInUserPool(email, userPoolId);

        if (userInUserPool)
            throw new InvalidOperationException("Email is already in use");
    }

    public Task<User> ValidateUser(User user)
    {
        user.DisplayName = InputSanitiser.SingleLine(user.DisplayName);
        user.Bio = InputSanitiser.MultiLine(user.Bio);
        user.FirstName = InputSanitiser.SingleLine(user.FirstName);
        user.LastName = InputSanitiser.SingleLine(user.LastName);
        user.City = InputSanitiser.SingleLine(user.City);
        user.Country = InputSanitiser.SingleLine(user.Country);

        var result = Validator.Validate(user);

        if (result.IsValid)
            return Task.FromResult(user);

        var errorMessages = result.Errors.Select(x => x.ErrorMessage);
        throw new ArgumentException(string.Join(" ", errorMessages));
    }
}
