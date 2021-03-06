import * as _ from 'lodash';
import * as React from 'react';
import { observable, action, autorun, runInAction, reaction } from 'mobx';
import { observer, disposeOnUnmount } from 'mobx-react';
import * as Randexp from 'randexp';

import { matchers } from "mockttp";

import { styled } from '../../styles';

import { Matcher, MatcherClass, MatcherLookup, MatcherClassKey } from "../../model/rules/rules";

import { TextInput } from '../common/inputs';
import {
    EditableHeaders,
    HeadersArray,
    headersArrayToHeaders,
    headersToHeadersArray
} from '../common/editable-headers';

type MatcherConfigProps<M extends Matcher> = {
    matcher?: M;
    matcherIndex: number | undefined,
    onChange: (...matchers: Matcher[] & { 0?: M }) => void;
    onInvalidState: () => void;
};

abstract class MatcherConfig<M extends Matcher> extends React.Component<MatcherConfigProps<M>> { }

export function MatcherConfiguration(props:
    ({ matcher: Matcher } | { matcherClass?: MatcherClass }) & {
        matcherIndex: number | undefined,
        onChange: (...matchers: Matcher[]) => void,
        onInvalidState?: () => void
    }
) {
    const { matcher } = props as { matcher?: Matcher };

    const matcherClass = 'matcher' in props
        ? MatcherLookup[props.matcher.type as MatcherClassKey]
        : props.matcherClass;

    const configProps = {
        matcher: matcher as any,
        matcherIndex: props.matcherIndex,
        onChange: props.onChange,
        onInvalidState: props.onInvalidState || _.noop
    };

    switch (matcherClass) {
        case matchers.HostMatcher:
            return <HostMatcherConfig {...configProps} />;
        case matchers.SimplePathMatcher:
            return <SimplePathMatcherConfig {...configProps} />;
        case matchers.RegexPathMatcher:
            return <RegexPathMatcherConfig {...configProps} />;
        case matchers.ExactQueryMatcher:
            return <ExactQueryMatcherConfig {...configProps} />;
        case matchers.HeaderMatcher:
            return <HeaderMatcherConfig {...configProps} />;
        default:
            return null;
    }
}

const ConfigLabel = styled.label`
    margin: 5px 0;

    text-transform: uppercase;
    font-size: ${p => p.theme.textSize};
    opacity: ${p => p.theme.lowlightTextOpacity};
`;

const MatcherConfigContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

@observer
class HostMatcherConfig extends MatcherConfig<matchers.HostMatcher> {

    private fieldId = _.uniqueId();

    @observable
    private error: Error | undefined;

    @observable
    private host = '';

    componentDidMount() {
        disposeOnUnmount(this, autorun(() => {
            const host = this.props.matcher ? this.props.matcher.host : '';
            runInAction(() => { this.host = host });
        }));
    }

    render() {
        const { host } = this;
        const { matcherIndex } = this.props;

        return <MatcherConfigContainer title={
            host
                ? `Matches all requests to ${
                    host
                }, regardless of their path or protocol`
                : undefined
        }>
            { matcherIndex !== undefined &&
                <ConfigLabel htmlFor={this.fieldId}>
                    { matcherIndex !== 0 && 'and ' } for host
                </ConfigLabel>
            }
            <TextInput
                id={this.fieldId}
                invalid={!!this.error}
                spellCheck={false}
                value={host}
                onChange={this.onChange}
                placeholder='A specific host to match: example.com'
            />
        </MatcherConfigContainer>;
    }

    @action.bound
    onChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.host = event.target.value;

        try {
            this.props.onChange(new matchers.HostMatcher(this.host));
            this.error = undefined;
            event.target.setCustomValidity('');
        } catch (e) {
            console.log(e);

            this.error = e;
            this.props.onInvalidState();
            event.target.setCustomValidity(e.message);
        }
        event.target.reportValidity();
    }
}

@observer
class SimplePathMatcherConfig extends MatcherConfig<matchers.SimplePathMatcher> {

    private fieldId = _.uniqueId();

    @observable
    private error: Error | undefined;

    @observable
    private url = '';

    componentDidMount() {
        // Avoid overriding state for new matchers, this lets us allow ? in the
        // string initially, and delay splitting into two matchers until later.
        if (this.props.matcherIndex === undefined) return;

        disposeOnUnmount(this, autorun(() => {
            const url = this.props.matcher ? this.props.matcher.path : '';

            runInAction(() => { this.url = url });
        }));
    }

    render() {
        const { url } = this;
        const { matcherIndex } = this.props;

        const urlMatch = (/(\w+:\/\/)?([^/?#]+)?(\/[^?#]*)?/.exec(url) || []);
        const [fullMatch, protocol, host, path] = urlMatch;

        return <MatcherConfigContainer title={
            (host || path)
                ? `Matches ${
                    protocol ? protocol.slice(0, -3) : 'any'
                } requests to ${
                    host ? `host ${host}` : 'any host'
                } at ${
                    path ? `path ${path}` : 'path /'
                }`
                : undefined
        }>
            { matcherIndex !== undefined &&
                <ConfigLabel htmlFor={this.fieldId}>
                    { matcherIndex !== 0 && 'and ' } for URL
                </ConfigLabel>
            }
            <TextInput
                id={this.fieldId}
                invalid={!!this.error}
                spellCheck={false}
                value={url}
                onChange={this.onChange}
                placeholder='A specific URL to match: http://example.com/abc'
            />
        </MatcherConfigContainer>;
    }

    ensurePathIsValid() {
        if (!this.url) throw new Error('The URL must not be empty');

        // If you start a URL with a protocol, it must be fully parseable:
        if (this.url.match(/\w+:\//)) {
            new URL(this.url);
        }

        // We leave the rest of the parsing to the SimplePathMatcher itself
    }

    @action.bound
    onChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.url = event.target.value.split('#')[0];

        try {
            this.ensurePathIsValid();

            const [baseUrl, query] = this.url.split('?');

            if (query === undefined) {
                this.props.onChange(new matchers.SimplePathMatcher(baseUrl));
            } else {
                if (this.props.matcherIndex !== undefined) this.url = baseUrl;

                this.props.onChange(
                    new matchers.SimplePathMatcher(baseUrl),
                    new matchers.ExactQueryMatcher('?' + query)
                );
            }
            this.error = undefined;
            event.target.setCustomValidity('');
        } catch (e) {
            console.log(e);

            this.error = e;
            this.props.onInvalidState();
            event.target.setCustomValidity(e.message);
        }
        event.target.reportValidity();
    }
}

function unescapeRegexp(input: string): string {
    return input.replace(/\\\//g, '/');
}

const RegexInput = styled(TextInput)`
    font-family: ${p => p.theme.monoFontFamily};
`;

// A crazy (but fun) regex to spot literal ? characters in regular expression strings.
// Has some false (crazy) negatives but should have no false positives. Example false negative: [\]?]
// This is a big silly - if it ever breaks, fall back to using regjsparser instead (spot codepoint 63)
const containsLiteralQuestionMark = /([^\\]|^)\\(\?|u003F|x3F)|([^\\]|^)\[[^\]]*(\?|u003F|x3F)/;

@observer
class RegexPathMatcherConfig extends MatcherConfig<matchers.RegexPathMatcher> {

    private fieldId = _.uniqueId();

    @observable
    private error: Error | undefined;

    @observable
    private pattern = '';

    componentDidMount() {
        disposeOnUnmount(this, autorun(() => {
            const pattern = this.props.matcher
                ? unescapeRegexp(this.props.matcher.regexSource)
                : '';

            runInAction(() => { this.pattern = pattern });
        }));
    }

    render() {
        const { matcherIndex } = this.props;

        let examples: string[] = [];
        let matchType: 'including' | 'that start with' | 'that end with' | 'like' = 'like';

        if (!this.error && this.props.matcher) {
            const { regexSource } = this.props.matcher;
            const regex = new RegExp(regexSource);
            const exp = new Randexp(regex);

            exp.defaultRange.subtract(32, 47); // Symbols
            exp.defaultRange.subtract(58, 64); // More symbols
            exp.defaultRange.subtract(123, 126); // Yet more symbols

            // For infinite ranges (.*), use up to 10 chars
            exp.max = 10;

            examples = _.uniq([exp.gen(), exp.gen(), exp.gen()])
                .filter((example) => example.length && example.match(regex))
                .sort();

            matchType =
                (regexSource.startsWith('^') && regexSource.endsWith('$'))
                    ? 'like'
                : regexSource.startsWith('^')
                    ? 'that start with'
                : regexSource.endsWith('$')
                    ? 'that end with'
                : 'including';
        }

        return <MatcherConfigContainer title={
                examples.length === 0
                    ? undefined
                : examples.length === 1
                    ? `Would match absolute URLs ${matchType} ${examples[0]}`
                : `Would match absolute URLs ${matchType}:\n\n${examples.join('\n')}`
            }>
            { matcherIndex !== undefined &&
                <ConfigLabel htmlFor={this.fieldId}>
                    { matcherIndex !== 0 && 'and ' } for URLs matching
                </ConfigLabel>
            }
            <RegexInput
                id={this.fieldId}
                invalid={!!this.error}
                spellCheck={false}
                value={this.pattern}
                onChange={this.onChange}
                placeholder='Any regular expression: https?://abc.com/.*'
            />
        </MatcherConfigContainer>;
    }

    @action.bound
    onChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.pattern = event.target.value;

        try {
            if (!this.pattern) throw new Error('A pattern to match is required');
            if (this.pattern.match(containsLiteralQuestionMark)) {
                throw new Error(
                    'Query strings are matched separately, so a literal ? character will never match'
                );
            }
            this.props.onChange(
                new matchers.RegexPathMatcher(new RegExp(this.pattern))
            );
            this.error = undefined;
            event.target.setCustomValidity('');
        } catch (e) {
            console.log(e);

            this.error = e;
            this.props.onInvalidState();
            event.target.setCustomValidity(e.message);
        }
        event.target.reportValidity();
    }
}

@observer
class ExactQueryMatcherConfig extends MatcherConfig<matchers.ExactQueryMatcher> {

    private fieldId = _.uniqueId();

    @observable
    private error: Error | undefined;

    @observable
    private query = '';

    componentDidMount() {
        disposeOnUnmount(this, autorun(() => {
            const query = this.props.matcher ? this.props.matcher.query : '';

            runInAction(() => { this.query = query });
        }));
    }

    render() {
        const { matcherIndex } = this.props;

        return <MatcherConfigContainer>
            { matcherIndex !== undefined &&
                <ConfigLabel htmlFor={this.fieldId}>
                    { matcherIndex !== 0 && 'and ' } with query
                </ConfigLabel>
            }
            <TextInput
                id={this.fieldId}
                invalid={!!this.error}
                spellCheck={false}
                value={this.query}
                onChange={this.onChange}
                placeholder='An exact query string to match, e.g. ?a=b'
            />
        </MatcherConfigContainer>;
    }

    @action.bound
    onChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.query = event.target.value;

        try {
            this.props.onChange(new matchers.ExactQueryMatcher(this.query));
            this.error = undefined;
            event.target.setCustomValidity('');
        } catch (e) {
            console.log(e);

            this.error = e;
            this.props.onInvalidState();
            event.target.setCustomValidity(e.message);
        }
        event.target.reportValidity();
    }
}

const headersArrayToFlatHeaders = (headers: HeadersArray) =>
    _.mapValues(
        headersArrayToHeaders(
            headers.filter(([k, v]) => k && v)
        ),
        (value) =>
            _.isArray(value)
                ? value.join(', ')
                : value! // We know this is set because of filter above
    )


@observer
class HeaderMatcherConfig extends MatcherConfig<matchers.HeaderMatcher> {

    @observable
    private headers: HeadersArray = [];

    componentDidMount() {
        disposeOnUnmount(this, reaction(
            () => this.props.matcher ? this.props.matcher.headers : {},
            (headers) => {
                if (!_.isEqual(headers, headersArrayToFlatHeaders(this.headers))) {
                    this.headers = headersToHeadersArray(headers);
                }
            },
            { fireImmediately: true }
        ));
    }

    render() {
        const { matcherIndex } = this.props;

        return <MatcherConfigContainer>
            { matcherIndex !== undefined &&
                <ConfigLabel>
                    { matcherIndex !== 0 && 'and ' } with headers including
                </ConfigLabel>
            }
            <EditableHeaders
                headers={this.headers}
                onChange={this.onChange}
            />
        </MatcherConfigContainer>;
    }

    @action.bound
    onChange(headers: HeadersArray) {
        this.headers = headers;

        try {
            if (_.some(headers, ([_name, value]) => !value)) {
                throw new Error("Invalid headers; header values can't be empty");
            }
            if (_.some(headers, ([name]) => !name)) {
                throw new Error("Invalid headers; header names can't be empty");
            }

            if (headers.length === 0) {
                this.props.onChange();
            } else {
                this.props.onChange(new matchers.HeaderMatcher(
                    headersArrayToFlatHeaders(this.headers)
                ));
            }
        } catch (e) {
            console.log(e);
            this.props.onInvalidState();
        }
    }
}