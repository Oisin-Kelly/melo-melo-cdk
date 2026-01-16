using System.Text.RegularExpressions;
using Domain;
using FluentValidation;
using Ports;

namespace Adapters;

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

public partial class UserValidationService : IUserValidationService
{
    private readonly IUserPoolService _userPoolService;

    [GeneratedRegex("^[a-zA-Z0-9._]{2,30}$", RegexOptions.Compiled)]
    private static partial Regex UsernameRegex();

    [GeneratedRegex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"[^\S\r\n]+", RegexOptions.Compiled)]
    private static partial Regex ExtraWhitespaceRegex();

    [GeneratedRegex(@"(\r?\n){3,}", RegexOptions.Compiled)]
    private static partial Regex ExtraNewLinesRegex();

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

    public async Task<User> ValidateUser(User user)
    {
        user.DisplayName = SanitiseInput(user.DisplayName);
        user.Bio = SanitiseInput(user.Bio);
        user.FirstName = SanitiseInput(user.FirstName);
        user.LastName = SanitiseInput(user.LastName);
        user.City = SanitiseInput(user.City);
        user.Country = SanitiseInput(user.Country);

        var validator = new UserValidator();
        var result = await validator.ValidateAsync(user);

        if (result.IsValid)
            return user;

        var errorMessages = result.Errors.Select(x => x.ErrorMessage);
        throw new ArgumentException(string.Join(" ", errorMessages));
    }

    private static string? SanitiseInput(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var sanitised = ExtraWhitespaceRegex().Replace(input.Trim(), " ");

        sanitised = ExtraNewLinesRegex().Replace(sanitised, Environment.NewLine + Environment.NewLine);

        return string.IsNullOrEmpty(sanitised) ? null : sanitised;
    }
}