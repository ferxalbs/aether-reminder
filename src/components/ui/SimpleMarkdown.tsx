import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Typography } from './Typography';
import { Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';

interface SimpleMarkdownProps {
  content: string;
}

export const SimpleMarkdown: React.FC<SimpleMarkdownProps> = ({ content }) => {
  const colors = useSemanticColors();

  const blocks = useMemo(() => {
    return content.split('\n\n').filter((block) => block.trim().length > 0);
  }, [content]);

  const renderBlock = (block: string, index: number) => {
    // Basic list support
    if (block.startsWith('- ') || block.startsWith('* ')) {
      const items = block.split('\n').filter((item) => item.startsWith('- ') || item.startsWith('* '));
      return (
        <View key={index} style={styles.list}>
          {items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Typography variant="body" style={styles.bullet}>•</Typography>
              <Typography variant="body" style={styles.listItemText}>
                {parseInline(item.substring(2))}
              </Typography>
            </View>
          ))}
        </View>
      );
    }

    return (
      <Typography key={index} variant="body" style={styles.paragraph}>
        {parseInline(block)}
      </Typography>
    );
  };

  const parseInline = (text: string) => {
    // Regex to match **bold** or *italic* or _italic_
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_)/g);

    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={index} style={{ fontWeight: 'bold', color: colors.textPrimary }}>
            {part.substring(2, part.length - 2)}
          </Text>
        );
      }
      if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        return (
          <Text key={index} style={{ fontStyle: 'italic', color: colors.textPrimary }}>
            {part.substring(1, part.length - 1)}
          </Text>
        );
      }
      return <Text key={index}>{part}</Text>;
    });
  };

  return <View style={styles.container}>{blocks.map(renderBlock)}</View>;
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  paragraph: {
    lineHeight: 22,
  },
  list: {
    gap: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bullet: {
    lineHeight: 22,
  },
  listItemText: {
    flex: 1,
    lineHeight: 22,
  },
});
