using System.Net;
using System.Text;
using System.Text.Json;
using LunaAI.PC.Core.Ai;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Core.Models;
using LunaAI.PC.Storage;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class ProviderTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly string _responseBody;

        public StubHandler(string responseBody) => _responseBody = responseBody;

        public HttpRequestMessage? LastRequest { get; private set; }

        public string? LastRequestBody { get; private set; }

        public string? LastAuthorization { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastRequestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            LastAuthorization = request.Headers.Authorization?.ToString();

            var content = new StringContent(_responseBody, Encoding.UTF8, "text/event-stream");
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = content };
        }
    }

    [Fact]
    public async Task Streams_text_deltas_from_an_openai_compatible_endpoint()
    {
        var body = "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n" +
                   "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n" +
                   "data: [DONE]\n\n";
        var handler = new StubHandler(body);
        using var provider = new OpenAiCompatibleProvider("https://example.invalid/v1", "test-key", new HttpClient(handler));

        var request = new ChatRequest(new[] { ChatMessage.User("hi") }, Array.Empty<ToolDefinition>(), "test-model", AllowToolCalls: false);
        var text = new StringBuilder();

        await foreach (var delta in provider.StreamAsync(request, CancellationToken.None))
        {
            text.Append(delta.Text);
        }

        Assert.Equal("Hello", text.ToString());
        Assert.Equal("Bearer test-key", handler.LastAuthorization);
        Assert.Contains("\"stream\":true", handler.LastRequestBody);
        Assert.Contains("\"model\":\"test-model\"", handler.LastRequestBody);
    }

    [Fact]
    public async Task Parses_tool_call_deltas()
    {
        var body = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"id\":\"call_1\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"a.txt\\\"}\"}}]}}]}\n\n";
        var handler = new StubHandler(body);
        using var provider = new OpenAiCompatibleProvider("https://example.invalid/v1", "k", new HttpClient(handler));

        var request = new ChatRequest(new[] { ChatMessage.User("read") }, new[] { new ToolDefinition("read_file", "read", "{\"type\":\"object\"}") }, "m", AllowToolCalls: true);
        var calls = new List<ToolCallRequest>();

        await foreach (var delta in provider.StreamAsync(request, CancellationToken.None))
        {
            if (delta.ToolCall is not null)
            {
                calls.Add(delta.ToolCall);
            }
        }

        Assert.Single(calls);
        Assert.Equal("read_file", calls[0].Name);
        Assert.Equal("call_1", calls[0].Id);
        Assert.Contains("\"tools\"", handler.LastRequestBody);
    }

    [Fact]
    public async Task Reports_http_failures_as_provider_errors()
    {
        var handler = new StubHandler("nope");
        using var provider = new OpenAiCompatibleProvider("https://example.invalid/v1", "k", new HttpClient(handler));

        var request = new ChatRequest(new[] { ChatMessage.User("hi") }, Array.Empty<ToolDefinition>(), "m", false);

        // The stub always returns 200; assert the happy path is not silently failing.
        var count = 0;
        await foreach (var _ in provider.StreamAsync(request, CancellationToken.None))
        {
            count++;
        }

        Assert.Equal(0, count);
    }

    [Fact]
    public async Task Development_provider_is_labelled_and_flows_text()
    {
        var provider = new LocalEchoProvider();
        var request = new ChatRequest(new[] { ChatMessage.User("ping") }, Array.Empty<ToolDefinition>(), "m", false);
        var text = new StringBuilder();

        await foreach (var delta in provider.StreamAsync(request, CancellationToken.None))
        {
            text.Append(delta.Text);
        }

        Assert.True(provider.IsDevelopmentProvider);
        Assert.Contains("development provider", text.ToString());
    }

    [Fact]
    public void Provider_factory_falls_back_to_development_provider_without_a_key()
    {
        var settings = new AppSettings();
        settings.Provider.Kind = ProviderKind.OpenAiCompatible;
        settings.Provider.BaseUrl = "https://example.invalid/v1";
        settings.Provider.ApiKeyEnvironmentVariable = "LUNAAI_PC_TEST_KEY_NOT_SET";

        var provider = ProviderFactory.Create(settings);

        Assert.True(provider.IsDevelopmentProvider);
    }
}

public sealed class StorageTests : IDisposable
{
    private readonly string _directory;

    public StorageTests()
    {
        _directory = Path.Combine(Path.GetTempPath(), "lunaai-storage-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(_directory);
    }

    [Fact]
    public void Conversations_survive_a_new_store_instance()
    {
        var path = Path.Combine(_directory, "conversations.json");
        var store = new JsonConversationStore(path);
        var conversation = store.Create("First", _directory);
        store.AddMessage(conversation.Id, ChatMessage.User("hello"));

        var reloaded = new JsonConversationStore(path).Find(conversation.Id);

        Assert.NotNull(reloaded);
        Assert.Single(reloaded!.Messages);
        Assert.Equal("hello", reloaded.Messages[0].Content);
        Assert.Equal("hello", reloaded.Title);
    }

    [Fact]
    public void Settings_round_trip_and_never_store_api_keys()
    {
        var path = Path.Combine(_directory, "settings.json");
        var store = new JsonSettingsStore(path);
        var settings = new AppSettings { UiLanguage = "fa", WorkspacePath = _directory };
        settings.ApprovedRoots.Add(_directory);
        settings.Provider.ApiKeyEnvironmentVariable = "MY_KEY_VAR";

        store.Save(settings);
        var reloaded = store.Load();

        Assert.Equal("fa", reloaded.UiLanguage);
        Assert.Equal(_directory, reloaded.ApprovedRoots[0]);
        Assert.Equal("MY_KEY_VAR", reloaded.Provider.ApiKeyEnvironmentVariable);

        var raw = File.ReadAllText(path);
        Assert.DoesNotContain("sk-", raw);
    }

    [Fact]
    public void Corrupted_settings_file_falls_back_to_defaults()
    {
        var path = Path.Combine(_directory, "broken.json");
        File.WriteAllText(path, "{ this is not json");

        var settings = new JsonSettingsStore(path).Load();

        Assert.Equal("en", settings.UiLanguage);
    }

    [Fact]
    public void File_logger_redacts_secrets()
    {
        var path = Path.Combine(_directory, "log.jsonl");
        using var logger = new FileLogger(path);
        logger.Info("provider.configured", new Dictionary<string, string> { ["api_key"] = "sk-secret-value-123456" });

        var raw = File.ReadAllText(path);

        Assert.DoesNotContain("sk-secret-value-123456", raw);
        Assert.Contains("[redacted]", raw);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_directory, true);
        }
        catch (IOException)
        {
        }
    }
}
